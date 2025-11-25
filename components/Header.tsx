// components/Header.tsx
import { createServerSupabase } from "@/lib/supabase/server";
import HeaderClient from "./HeaderClient";
import { hasSuperadminAccess } from "@/lib/superadmin";

function firstNameFrom(user: any): string | null {
  const meta = user?.user_metadata || {};
  const raw =
    meta.first_name ||
    meta.given_name ||
    meta.name ||
    meta.full_name ||
    user?.email ||
    null;

  if (!raw) return null;
  const token = String(raw).split("@")[0].trim();
  const first = token.split(/\s+/)[0] || token;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default async function Header() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let greeting: string | null = null;
  let canSeeAdmin = false;
  let isSuperadmin = false;

  if (user) {
    greeting = firstNameFrom(user);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    isSuperadmin = hasSuperadminAccess(user.email, profileData?.is_superadmin);
    canSeeAdmin = isSuperadmin;
  }

  return (
    <HeaderClient
      isAuthenticated={!!user}
      greeting={greeting}
      canSeeAdmin={canSeeAdmin}
      isSuperadmin={isSuperadmin}
    />
  );
}
