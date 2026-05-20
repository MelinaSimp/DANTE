// components/auth/AuthForm.tsx
"use client";

import { useState } from "react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Step = "signin" | "signup";

// Target verticals. Financial advisors are the primary audience;
// real estate is the near-term expansion. "Other" stays as a soft
// escape hatch so we don't block signups from adjacent industries,
// but everything onboarding/dashboard-wise is tuned for the first two.
const COMPANY_OPTIONS = [
  { value: "financial_advisor", label: "Financial advisor" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" },
] as const;

type CompanyCategory = (typeof COMPANY_OPTIONS)[number]["value"];

export default function AuthForm() {
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyType, setCompanyType] = useState<CompanyCategory | "">("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      if (step === "signup") {
        if (!firstName.trim() || !lastName.trim() || !companyType) {
          setMsg("Please provide your first name, last name, and company type.");
          setLoading(false);
          return;
        }

        const { error: signUpErr, data: signUpData } = await supabase.auth.signUp({
          email,
          password: pwd,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              company_category: companyType,
            },
          },
        });

        if (signUpErr) {
          setMsg(signUpErr.message);
        } else {
          if (signUpData.session) {
            setMsg(`Welcome, ${firstName}!`);
            location.assign("/auth/callback");
          } else {
            setMsg("Check your email to confirm, then sign in.");
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: pwd,
        });
        if (error) {
          setMsg(error.message);
        } else if (data.session) {
          setMsg("Welcome back!");
          location.assign("/auth/callback");
        } else {
          setMsg("Sign in successful, redirecting...");
          location.assign("/auth/callback");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const toggleClasses = (active: boolean) =>
    clsx(
      "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all",
      active
        ? "bg-gradient-to-r from-[#3351ff] to-[#4b63ff] text-white shadow-lg shadow-blue-500/30"
        : "border border-white/10 bg-[var(--canvas)]/5 text-white/60 hover:border-white/20 hover:text-white"
    );

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setStep("signin")} className={toggleClasses(step === "signin")}>
          Sign in
        </button>
        <button type="button" onClick={() => setStep("signup")} className={toggleClasses(step === "signup")}>
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/70">Email</label>
          <input
            className="w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/70">Password</label>
          <input
            className="w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            type="password"
            required
            autoComplete={step === "signin" ? "current-password" : "new-password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {step === "signup" && (
          <>
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-white/70">First name</label>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium text-white/70">Last name</label>
                <input
                  className="w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-white/70">Company type</span>
              <div className="flex gap-3">
                {COMPANY_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className={clsx(
                      "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition",
                      companyType === value
                        ? "border-blue-500 bg-blue-500/20 text-white shadow-lg"
                        : "border-white/15 bg-black/40 text-white/70 hover:border-white/25 hover:text-white"
                    )}
                  >
                    <input
                      type="radio"
                      name="company-type"
                      value={value}
                      checked={companyType === value}
                      onChange={() => setCompanyType(value)}
                      className="hidden"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
          {loading
            ? step === "signup"
              ? "Creating account..."
              : "Signing in..."
            : step === "signup"
            ? "Create account"
            : "Sign in"}
        </Button>

        {msg && <p className="text-sm text-white/70">{msg}</p>}
      </form>
    </div>
  );
}