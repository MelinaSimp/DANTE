// app/auth/signup/page.tsx
//
// Invite-token sign-up flow. Harvey-ized to match /auth: pure white
// canvas, editorial serif heading, 1px rules, ink-on-canvas submit.
// Server action preserved verbatim — only the visuals changed.

import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { isValidEmail, normalizeToken } from "@/lib/invite";
import { SIGNUP_INDUSTRIES, getIndustryConfig } from "@/lib/industry/config";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  async function redeem(formData: FormData) {
    "use server";
    const token = normalizeToken((formData.get("token") as string) || (resolvedParams?.token as string));
    const email = (formData.get("email") as string) || "";
    const password = (formData.get("password") as string) || "";
    const first_name = ((formData.get("first_name") as string) || "").trim();
    const last_name = ((formData.get("last_name") as string) || "").trim();
    const industry = ((formData.get("industry") as string) || "").trim();

    if (!first_name) throw new Error("First name is required.");
    if (!last_name) throw new Error("Last name is required.");
    // Net-new signups are wealth-only as of 2026-05-03 — see
    // SIGNUP_INDUSTRIES in lib/industry/config.ts. Existing
    // real_estate workspaces keep working; the front door is
    // closed, the back rooms aren't.
    if (!(SIGNUP_INDUSTRIES as readonly string[]).includes(industry)) {
      throw new Error("Please confirm you're a financial advisor.");
    }

    if (!token) throw new Error("Invite token is required.");
    if (!isValidEmail(email)) throw new Error("Valid email is required.");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

    // 1) Load invite
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("invites")
      .select("id, token, email, company_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invite) throw new Error("Invalid or already used invite.");

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error("Invite has expired.");
    }
    if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
      throw new Error("This invite is locked to a different email.");
    }
    if (!invite.company_id) {
      throw new Error("Invite is missing company/workspace id.");
    }

    // 2) Create auth user (verified)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${first_name} ${last_name}`.trim(),
        first_name,
        last_name,
        company_category: industry,
      },
    });
    if (createErr) {
      // If already exists, we’ll fetch id instead of crashing outright
      if (!String(createErr.message || "").toLowerCase().includes("already registered")) {
        throw createErr;
      }
    }

    // Find user id (either from creation or by lookup)
    let userId = created?.user?.id;
    if (!userId) {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing?.id) throw new Error("Could not resolve user id for existing account.");
      userId = existing.id;
    }

    // 3) Attach profile to tenant via workspace_id (mapping from company_id)
    const workspace_id = invite.company_id; // using same uuid as your workspace key
    const { error: upErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: `${first_name} ${last_name}`.trim(),
      first_name,
      last_name,
      company_category: industry,
      email,
      role: "member",
      workspace_id,
    });
    if (upErr) throw upErr;

    // 4) Stamp the workspace's industry from the user's pick. Only the
    //    first redeemer's choice sticks — subsequent joiners join the
    //    workspace already configured for that vertical.
    await supabaseAdmin
      .from("workspaces")
      .update({ industry })
      .eq("id", workspace_id);

    // 5) Delete invite (single-use)
    await supabaseAdmin.from("invites").delete().eq("id", invite.id);

    // 5) Create a session for the new user so they land signed in
    const supabase = await createServerSupabase();
    // Password sign-in (since email is confirmed)
    await supabase.auth.signInWithPassword({ email, password });

    redirect("/"); // you can change to /contacts or /settings
  }

  const inputClass =
    "w-full px-3.5 py-3 text-sm outline-none transition-colors";
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--rule)",
    background: "var(--canvas)",
    color: "var(--ink)",
    borderRadius: "var(--r-input)",
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

      <div className="relative z-10 flex items-center justify-center min-h-screen px-6 py-16">
        <div className="w-full max-w-[440px]">
          <div
            className="card-flat p-8"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="mb-6">
              <div className="label-section mb-2">Join workspace</div>
              <h1
                className="heading-display text-3xl mb-1"
                style={{ color: "var(--ink)" }}
              >
                Create your account
              </h1>
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                Redeem your invite to join your company workspace.
              </p>
            </div>

            <form action={redeem} className="space-y-3">
              <div>
                <label
                  className="label-section mb-1.5 block"
                  style={{ color: "var(--ink-muted)" }}
                >
                  Invite token
                </label>
                <input
                  name="token"
                  defaultValue={normalizeToken(resolvedParams?.token)}
                  placeholder="DRIFT-XXXX-YYYY"
                  className={`${inputClass} mono`}
                  style={inputStyle}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  name="first_name"
                  placeholder="First name"
                  className={inputClass}
                  style={inputStyle}
                  required
                />
                <input
                  name="last_name"
                  placeholder="Last name"
                  className={inputClass}
                  style={inputStyle}
                  required
                />
              </div>

              <input
                name="email"
                type="email"
                placeholder="Email"
                className={inputClass}
                style={inputStyle}
                required
              />

              <input
                name="password"
                type="password"
                placeholder="Password (8+ characters)"
                className={inputClass}
                style={inputStyle}
                required
                minLength={8}
              />

              <fieldset className="space-y-1.5">
                <legend
                  className="label-section block mb-1.5"
                  style={{ color: "var(--ink-muted)" }}
                >
                  I am a…
                </legend>
                <div className={`grid gap-2 ${SIGNUP_INDUSTRIES.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {SIGNUP_INDUSTRIES.map((id, idx) => {
                    const cfg = getIndustryConfig(id);
                    return (
                      <label
                        key={id}
                        className="flex items-center justify-center text-sm px-3 py-2.5 cursor-pointer transition has-[:checked]:bg-[var(--canvas-subtle)] has-[:checked]:font-semibold has-[:checked]:border-[var(--ink)]"
                        style={{
                          border: "1px solid var(--rule)",
                          background: "var(--canvas)",
                          color: "var(--ink)",
                          borderRadius: "var(--r-input)",
                        }}
                      >
                        <input
                          type="radio"
                          name="industry"
                          value={id}
                          required
                          defaultChecked={idx === 0}
                          className="sr-only"
                        />
                        {cfg.shortLabel}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <button
                type="submit"
                className="w-full px-4 py-3 text-sm font-medium transition mt-2"
                style={{
                  background: "var(--ink)",
                  color: "var(--canvas)",
                  borderRadius: "var(--r-input)",
                  cursor: "pointer",
                }}
              >
                Create account
              </button>
            </form>

            <p
              className="mt-5 text-center text-[11px] leading-relaxed"
              style={{ color: "var(--ink-subtle)" }}
            >
              Having trouble? Ask your admin for a fresh token or direct signup link.
            </p>
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
