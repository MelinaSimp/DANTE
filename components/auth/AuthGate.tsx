import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import SignOutButton from "@/components/auth/SignOutButton";

export default async function AuthGate() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const label = user.user_metadata?.full_name || user.email || "Account";
    return (
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-sm text-[var(--ink-muted)]">Hi, {label}</span>
        <SignOutButton />
      </div>
    );
  }

  return (
    <Link
      href="/auth"
      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#229CF3] to-[#60B2F5] text-white hover:from-[#1E8CE8] hover:to-[#4DA8F4] shadow-sm hover:shadow-md px-6 py-2 text-sm font-medium transition-all"
    >
      Sign in
    </Link>
  );
}
