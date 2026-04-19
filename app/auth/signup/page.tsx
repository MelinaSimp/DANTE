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
    const company_category = ((formData.get("company_category") as string) || "").trim();

    if (!first_name) throw new Error("First name is required.");
    if (!last_name) throw new Error("Last name is required.");
    if (!company_category || !["service", "restaurant"].includes(company_category)) {
      throw new Error("Company type is required.");
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
        company_category,
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
      company_category,
      email,
      role: "member",
      workspace_id,
    });
    if (upErr) throw upErr;

    // 4) Delete invite (single-use)
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

              <select
                name="company_category"
                className={inputClass}
                style={inputStyle}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Company type…
                </option>
                <option value="service">Service-based company</option>
                <option value="restaurant">Restaurant</option>
              </select>

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
