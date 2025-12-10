// app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { Sparkles, ArrowRight } from "lucide-react";

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
          // Redirect through callback to ensure session is properly set
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
          // Redirect through callback to ensure session is properly set
          window.location.href = "/auth/callback";
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1612] text-white flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
            </div>
            <span className="text-2xl font-semibold">Drift</span>
          </Link>
          <h1 className="text-3xl font-bold mb-2">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-white/60">
            {isSignUp
              ? "Start building AI agents today"
              : "Sign in to continue building your AI agents"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 backdrop-blur">
          {/* Toggle */}
          <div className="mb-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setError(null);
                setMessage(null);
              }}
              className={`rounded-3xl px-4 py-2 text-sm font-medium transition ${
                !isSignUp
                  ? "bg-[#3351ff] text-white"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setError(null);
                setMessage(null);
              }}
              className={`rounded-3xl px-4 py-2 text-sm font-medium transition ${
                isSignUp
                  ? "bg-[#3351ff] text-white"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              Sign up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/70">
                      First name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#3351ff] focus:outline-none"
                      placeholder="John"
                      required={isSignUp}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/70">
                      Last name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#3351ff] focus:outline-none"
                      placeholder="Doe"
                      required={isSignUp}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/70">
                    Company name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#3351ff] focus:outline-none"
                    placeholder="Your Company"
                    required={isSignUp}
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#3351ff] focus:outline-none"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/70">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-white placeholder:text-white/40 focus:border-[#3351ff] focus:outline-none"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="rounded-2xl bg-red-500/20 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl bg-green-500/20 border border-green-500/30 px-4 py-3 text-sm text-green-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-[#3351ff] hover:bg-[#4a64ff] px-4 py-3 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                "Loading..."
              ) : (
                <>
                  {isSignUp ? "Create account" : "Sign in"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {isSignUp && (
            <p className="mt-4 text-center text-xs text-white/50">
              By signing up, you agree to our Terms of Service and Privacy Policy
            </p>
          )}
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-white/60 hover:text-white transition"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
