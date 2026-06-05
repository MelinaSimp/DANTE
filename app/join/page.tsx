"use client";

// Workspace join page. Harvey-ized to match the rest of the auth
// flow: pure white canvas, editorial serif header, flat card, 1px
// rules. Shown to users who have an auth session but no workspace
// yet — they redeem an invite code their admin shared.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { KeyRound, ArrowRight, Loader2, LogOut, Sparkles } from "lucide-react";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const startTrial = useCallback(async () => {
    setTrialLoading(true);
    setError("");
    try {
      const r = await fetch("/api/workspace/trial", { method: "POST" });
      const data = await r.json();
      if (r.ok && data.success) {
        setSuccess(data.workspace_name || "Trial workspace");
        setTimeout(() => router.push("/onboarding"), 1200);
      } else {
        setError(data.error || "Failed to create trial workspace");
        setTrialLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setTrialLoading(false);
    }
  }, [router]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/auth");
        return;
      }
      // If user signed up with pending_trial flag, auto-provision
      if (user.user_metadata?.pending_trial) {
        startTrial();
        // Clear the flag so it doesn't fire again
        supabase.auth.updateUser({
          data: { pending_trial: null },
        }).catch(() => {});
      }
    });
  }, [router, startTrial]);

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

  const handleJoin = async () => {
    if (!code.trim()) {
      setError("Please enter an invite code");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/workspace/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        setSuccess(data.workspace_name || "Workspace");
        // Land on the dashboard, not the orb hub.
        setTimeout(() => router.push("/dashboard"), 1200);
      } else {
        setError(data.error || "Invalid invite code");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px]">
          <div
            className="card-flat p-8"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="mb-6">
              <div className="label-section mb-2">Get started</div>
              <h1
                className="heading-display text-3xl mb-1"
                style={{ color: "var(--ink)" }}
              >
                Join or start a workspace
              </h1>
              <p
                className="text-sm"
                style={{ color: "var(--ink-muted)" }}
              >
                Enter a workspace code to join your firm, or start a
                free trial to explore on your own.
              </p>
            </div>

            {success ? (
              <div
                className="px-4 py-3 text-sm"
                style={{
                  background: "var(--verified-soft)",
                  color: "var(--verified)",
                  border: "1px solid var(--verified)",
                  borderRadius: "var(--r-input)",
                  animation: "panelSlideUp 0.18s ease-out",
                }}
              >
                <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                <div className="font-medium">Joined {success}</div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "var(--verified)", opacity: 0.8 }}
                >
                  Redirecting…
                </div>
              </div>
            ) : trialLoading ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ink-muted)" }} />
                <span className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  Setting up your trial workspace…
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <KeyRound
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoin();
                    }}
                    placeholder="DRIFT-XXXXXX"
                    className="w-full pl-10 pr-4 py-3 text-sm outline-none mono tracking-wider"
                    style={{
                      border: "1px solid var(--rule)",
                      background: "var(--canvas)",
                      color: "var(--ink)",
                      borderRadius: "var(--r-input)",
                    }}
                    autoFocus
                  />
                </div>

                {error && (
                  <div
                    className="px-3 py-2 text-sm"
                    style={{
                      background: "var(--danger-soft)",
                      color: "var(--danger)",
                      border: "1px solid var(--danger)",
                      borderRadius: "var(--r-input)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="w-full px-4 py-3 text-sm font-medium transition flex items-center justify-center gap-2"
                  style={{
                    background: "var(--ink)",
                    color: "var(--canvas)",
                    borderRadius: "var(--r-input)",
                    opacity: loading ? 0.5 : 1,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Join workspace</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div
                  className="flex items-center gap-3 py-2"
                  style={{ color: "var(--ink-subtle)" }}
                >
                  <div className="flex-1 h-px" style={{ background: "var(--rule)" }} />
                  <span className="text-[11px]">or</span>
                  <div className="flex-1 h-px" style={{ background: "var(--rule)" }} />
                </div>

                <button
                  onClick={startTrial}
                  disabled={trialLoading}
                  className="w-full px-4 py-3 text-sm font-medium transition flex items-center justify-center gap-2"
                  style={{
                    background: "var(--canvas)",
                    color: "var(--ink)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: "var(--r-input)",
                    cursor: "pointer",
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Start 14-day free trial</span>
                </button>

                <p
                  className="text-center text-[11px] leading-relaxed"
                  style={{ color: "var(--ink-subtle)" }}
                >
                  Full Starter-tier access. No credit card required.
                  Upgrade anytime to keep your data.
                </p>
              </div>
            )}
          </div>

          <div
            className="mt-6 text-center text-[11px] mono"
            style={{ color: "var(--ink-subtle)" }}
          >
            © {new Date().getFullYear()} Drift AI
          </div>
        </div>
      </div>
    </div>
  );
}
