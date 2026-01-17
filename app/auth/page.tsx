// app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

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
      // Check if it's a network/fetch error
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        setError("Unable to connect to authentication service. Please check your internet connection and try again. If the problem persists, the Supabase configuration may be missing.");
      } else {
        setError(err.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-16">
      {/* Top Logo - Apple style */}
      <div className="absolute top-8 left-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <img 
            src="/brand/logo-circle.png" 
            alt="Drift Logo"
            className="w-6 h-6 rounded-full object-cover"
          />
          <span className="text-lg font-medium text-gray-900">Drift</span>
        </Link>
      </div>

      <div className="w-full max-w-[420px]">
        {/* Main Auth Card - Apple style white card */}
        <div className="bg-white rounded-2xl shadow-lg p-10">
          {/* Logo with colorful pattern background */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-pink-500 via-purple-500 to-blue-500 rounded-full blur-xl opacity-60 animate-pulse"></div>
              <div className="relative bg-white rounded-full p-3">
                <img 
                  src="/brand/logo-circle.png" 
                  alt="Drift Logo"
                  className="w-12 h-12 rounded-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-gray-900 text-center mb-8">
            {isSignUp ? "Create your account" : "Sign in with Drift"}
          </h1>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                      placeholder="First name"
                      required={isSignUp}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                      placeholder="Last name"
                      required={isSignUp}
                    />
                  </div>
                </div>
                <div>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                    placeholder="Company name"
                    required={isSignUp}
                  />
                </div>
              </>
            )}

            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Email"
                required
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Password"
                required
                minLength={8}
              />
            </div>

            {/* Keep me signed in checkbox - Apple style */}
            {!isSignUp && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="keepSignedIn"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="keepSignedIn" className="ml-2 text-sm text-gray-600">
                  Keep me signed in
                </label>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-3 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : (isSignUp ? "Create account" : "Sign in")}
            </button>
          </form>

          {/* Links - Apple style */}
          <div className="mt-6 space-y-3 text-center">
            {!isSignUp && (
              <>
                <Link
                  href="#"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    // TODO: Implement forgot password
                  }}
                >
                  Forgotten your email or password?
                </Link>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Create account
                  </button>
                </div>
              </>
            )}
            {isSignUp && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Already have an account? Sign in
                </button>
              </div>
            )}
          </div>

          {isSignUp && (
            <p className="mt-6 text-center text-xs text-gray-500">
              By signing up, you agree to our{" "}
              <Link href="#" className="text-blue-600 hover:underline">Terms of Service</Link>{" "}
              and{" "}
              <Link href="#" className="text-blue-600 hover:underline">Privacy Policy</Link>
            </p>
          )}
        </div>

        {/* Footer - Apple style */}
        <div className="mt-8 text-center text-xs text-gray-500">
          Copyright © {new Date().getFullYear()} Drift AI. All rights reserved.
        </div>
      </div>
    </div>
  );
}
