"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { GLSLHills } from "@/components/ui/glsl-hills";

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    html.style.setProperty("background", "#000", "important");
    body.style.setProperty("background", "#000", "important");
    body.style.setProperty("color", "#fff", "important");
    if (main) (main as HTMLElement).style.setProperty("background", "#000", "important");
    return () => {
      html.style.removeProperty("background");
      body.style.removeProperty("background");
      body.style.removeProperty("color");
      if (main) (main as HTMLElement).style.removeProperty("background");
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        if (!firstName.trim() || !lastName.trim() || !companyName.trim()) {
          setError("First name, last name, and company name are required");
          setLoading(false);
          return;
        }

        const { error: signUpError, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              company_name: companyName.trim(),
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else if (data.session) {
          window.location.href = "/auth/callback";
        } else {
          setMessage("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { error: signInError, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else if (data.session) {
          window.location.href = "/auth/callback";
        }
      }
    } catch (err: any) {
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setError("Unable to connect. Please check your internet connection.");
      } else {
        setError(err.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* GLSL Hills background */}
      <div className="absolute inset-0 z-0 opacity-70">
        <GLSLHills speed={0.3} cameraZ={140} />
      </div>

      {/* Gradient overlays for depth */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* Top Logo */}
      <div className="absolute top-8 left-8 z-10">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/brand/logo-circle.png"
            alt="Drift Logo"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-lg font-medium text-white/80 group-hover:text-white transition">
            Drift
          </span>
        </Link>
      </div>

      {/* Card container */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-16">
        <div className="w-full max-w-[420px]">
          {/* Glass card */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/40 p-10">
            {/* Logo */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/50 via-violet-500/40 to-blue-500/30 rounded-full blur-xl scale-150 animate-pulse" />
                <div className="relative bg-black/50 backdrop-blur-sm rounded-full p-3 ring-1 ring-white/10">
                  <img
                    src="/brand/logo-circle.png"
                    alt="Drift Logo"
                    className="w-12 h-12 rounded-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-semibold text-white text-center mb-1">
              {isSignUp ? "Create your account" : "Sign in to Drift"}
            </h1>
            <p className="text-sm text-white/40 text-center mb-8">
              {isSignUp ? "Get started with your workspace" : "Welcome back"}
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition"
                      placeholder="First name"
                      required={isSignUp}
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition"
                      placeholder="Last name"
                      required={isSignUp}
                    />
                  </div>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition"
                    placeholder="Company name"
                    required={isSignUp}
                  />
                </>
              )}

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition"
                placeholder="Email"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition"
                placeholder="Password"
                required
                minLength={8}
              />

              {!isSignUp && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="keepSignedIn"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30 focus:ring-offset-0"
                  />
                  <label htmlFor="keepSignedIn" className="ml-2 text-xs text-white/40">
                    Keep me signed in
                  </label>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            {/* Links */}
            <div className="mt-6 space-y-2 text-center">
              {!isSignUp ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-xs text-white/40 hover:text-white/70 transition"
                  >
                    Don&apos;t have an account? <span className="text-white/60 underline underline-offset-2">Create one</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-xs text-white/40 hover:text-white/70 transition"
                >
                  Already have an account? <span className="text-white/60 underline underline-offset-2">Sign in</span>
                </button>
              )}
            </div>

            {isSignUp && (
              <p className="mt-5 text-center text-[11px] text-white/25 leading-relaxed">
                By signing up, you agree to our{" "}
                <Link href="#" className="text-white/40 hover:text-white/60 underline underline-offset-2 transition">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="#" className="text-white/40 hover:text-white/60 underline underline-offset-2 transition">
                  Privacy Policy
                </Link>
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-[11px] text-white/20">
            © {new Date().getFullYear()} Drift AI
          </div>
        </div>
      </div>
    </div>
  );
}
