// app/auth/signup/page.tsx
import { redirect } from "next/navigation";
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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
        <div className="absolute left-1/3 top-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-[#3351ff]/35 via-transparent to-transparent blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/3 h-[26rem] w-[26rem] rounded-full bg-gradient-to-tr from-[#1b3b6f]/30 via-transparent to-transparent blur-[180px]" />
      </div>

      <form
        action={redeem}
        className="relative z-10 w-full max-w-md space-y-5 rounded-3xl border border-white/12 bg-black/65 p-10 shadow-[0_30px_90px_rgba(9,9,17,0.55)] backdrop-blur"
      >
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Create your account</h1>
          <p className="mt-2 text-sm text-white/60">Use your invite to join your company workspace.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">Invite token</label>
          <input
            name="token"
            defaultValue={normalizeToken(resolvedParams?.token)}
            placeholder="DRIFT-XXXX-YYYY"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">First name</label>
          <input
            name="first_name"
            placeholder="Jane"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">Last name</label>
          <input
            name="last_name"
            placeholder="Doe"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">Email</label>
          <input
            name="email"
            type="email"
            placeholder="jane@acme.com"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">Password</label>
          <input
            name="password"
            type="password"
            placeholder="••••••••"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
            minLength={8}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white/70">Company type</label>
          <select
            name="company_category"
            className="w-full rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select one
            </option>
            <option value="service">Service-based company</option>
            <option value="restaurant">Restaurant</option>
          </select>
        </div>

        <button className="w-full rounded-full bg-gradient-to-r from-[#3351ff] to-[#4b63ff] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-[#4663ff] hover:to-[#5f74ff]">
          Create account
        </button>

        <p className="text-xs text-white/50">
          Having trouble? Ask your admin for a fresh token or a direct signup link.
        </p>
      </form>
    </main>
  );
}
