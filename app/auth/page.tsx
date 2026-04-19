"use client";

// Sign-in / sign-up page, Harvey-ized.
// Pure white canvas, editorial serif heading, 1px rules, no glass, no
// GLSL hills. The page that sets the tone for a CCO's first 30 seconds
// with the product.

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  // The old dark-theme override set html/body to #000. The whole app is
  // now white-by-default, so we just make sure nothing legacy is still
  // overriding it.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        if (!firstName.trim() || !lastName.trim()) {
          setError("First name and last name are required");
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
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else if (data.session) {
          window.location.href = "/auth/callback";
        } else {
          setMessage(
            "Check your email to confirm, then sign in. You'll need a workspace invite code from your admin — use Join workspace after login."
          );
        }
      } else {
        const { error: signInError, data } =
          await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          setError(signInError.message);
        } else if (data.session) {
          window.location.href = "/auth/callback";
        }
      }
    } catch (err: any) {
      if (
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        setError("Unable to connect. Please check your internet connection.");
      } else {
        setError(err.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--rule)",
    background: "var(--canvas)",
    color: "var(--ink)",
    padding: "12px 14px",
    fontSize: 14,
    borderRadius: "var(--r-input)",
    outline: "none",
    transition: "border-color 120ms ease",
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--canvas)" }}
    >
      {/* Top-left wordmark */}
      <div className="absolute top-6 left-6 md:top-8 md:left-10 z-10">
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
      </div>

      {/* Editorial intro column — shows only on wide screens. It gives
          the page the Harvey "quiet authority" feel without any
          decorative graphic. */}
      <div className="hidden lg:flex absolute left-[8%] top-1/2 -translate-y-1/2 max-w-md flex-col gap-6 z-10">
        <div className="label-section">For financial advisors</div>
        <h2
          className="heading-display text-5xl leading-[1.05]"
          style={{ color: "var(--ink)" }}
        >
          Every answer,
          <br />
          traced to a source.
        </h2>
        <p
          className="prose-body"
          style={{ color: "var(--ink-muted)", maxWidth: 380 }}
        >
          Drift grounds every call summary, meeting brief, and compliance
          check in the exact transcript segment, document chunk, or
          custodian balance it came from. A compliance officer can hover
          any claim and see where it came from.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <span className="chip-verified">Citation-grounded</span>
          <span className="chip-citation">Audit packet</span>
        </div>
      </div>

      {/* Card container */}
      <div className="relative z-10 flex items-center justify-center lg:justify-end min-h-screen px-6 py-16 lg:pr-[10%]">
        <div className="w-full max-w-[400px]">
          {/* Flat card */}
          <div
            className="card-flat p-8"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="mb-6">
              <div className="label-section mb-2">
                {isSignUp ? "Create account" : "Sign in"}
              </div>
              <h1
                className="heading-display text-3xl mb-1"
                style={{ color: "var(--ink)" }}
              >
                {isSignUp ? "Create your account" : "Welcome back"}
              </h1>
              <p
                className="text-sm"
                style={{ color: "var(--ink-muted)" }}
              >
                {isSignUp
                  ? "Use your workspace invite code after sign-up to join."
                  : "Sign in to continue."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={inputStyle}
                    placeholder="First name"
                    required={isSignUp}
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={inputStyle}
                    placeholder="Last name"
                    required={isSignUp}
                  />
                </div>
              )}

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="Email"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="Password"
                required
                minLength={8}
              />

              {!isSignUp && (
                <div className="flex items-center pt-1">
                  <input
                    type="checkbox"
                    id="keepSignedIn"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                    className="w-3.5 h-3.5"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <label
                    htmlFor="keepSignedIn"
                    className="ml-2 text-xs"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    Keep me signed in
                  </label>
                </div>
              )}

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

              {message && (
                <div
                  className="px-3 py-2 text-sm"
                  style={{
                    background: "var(--verified-soft)",
                    color: "var(--verified)",
                    border: "1px solid var(--verified)",
                    borderRadius: "var(--r-input)",
                  }}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 text-sm font-medium transition"
                style={{
                  background: "var(--ink)",
                  color: "var(--canvas)",
                  borderRadius: "var(--r-input)",
                  opacity: loading ? 0.5 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading
                  ? "Loading…"
                  : isSignUp
                  ? "Create account"
                  : "Sign in"}
              </button>
            </form>

            <div className="mt-6 text-center">
              {!isSignUp ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-xs transition"
                  style={{ color: "var(--ink-muted)" }}
                >
                  Don&apos;t have an account?{" "}
                  <span
                    className="underline underline-offset-2"
                    style={{ color: "var(--accent)" }}
                  >
                    Create one
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-xs transition"
                  style={{ color: "var(--ink-muted)" }}
                >
                  Already have an account?{" "}
                  <span
                    className="underline underline-offset-2"
                    style={{ color: "var(--accent)" }}
                  >
                    Sign in
                  </span>
                </button>
              )}
            </div>

            {isSignUp && (
              <p
                className="mt-5 text-center text-[11px] leading-relaxed"
                style={{ color: "var(--ink-subtle)" }}
              >
                By signing up, you agree to our{" "}
                <Link
                  href="/terms"
                  className="underline underline-offset-2"
                  style={{ color: "var(--ink-muted)" }}
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2"
                  style={{ color: "var(--ink-muted)" }}
                >
                  Privacy Policy
                </Link>
              </p>
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
