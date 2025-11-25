import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { hasSuperadminAccess, SUPERADMIN_EMAIL } from "@/lib/superadmin";

export default async function TestSuperadminPage() {
  const supabase = await createServerSupabase();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Test Superadmin</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Not logged in.</p>
        </div>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Force redirect if superadmin
  if (hasSuperadminAccess(user.email, profile?.is_superadmin)) {
    redirect("/superadmin");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Test Superadmin Redirect</h1>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          You are NOT a superadmin. Only {SUPERADMIN_EMAIL} has superadmin access.
        </p>
        <pre className="mt-3 max-h-60 overflow-y-auto rounded bg-yellow-100 p-3 text-xs text-yellow-900">
          {JSON.stringify(profile, null, 2)}
        </pre>
      </div>
    </div>
  );
}
